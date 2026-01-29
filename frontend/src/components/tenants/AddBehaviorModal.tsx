import React, { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface AddBehaviorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: BehaviorLogFormData) => Promise<void>;
}

export interface BehaviorLogFormData {
    type: 'positive' | 'negative' | 'neutral';
    category: string;
    scoreChange: number;
    description: string;
}

export const AddBehaviorModal: React.FC<AddBehaviorModalProps> = ({
    isOpen,
    onClose,
    onSubmit
}) => {
    const [formData, setFormData] = useState<BehaviorLogFormData>({
        type: 'negative',
        category: 'Late Payment',
        scoreChange: -10,
        description: ''
    });
    const [loading, setLoading] = useState(false);

    const handleTypeChange = (val: string) => {
        const type = val as 'positive' | 'negative' | 'neutral';
        let defaultScore = 0;
        if (type === 'negative') defaultScore = -10;
        if (type === 'positive') defaultScore = 5;

        setFormData(prev => ({ ...prev, type, scoreChange: defaultScore }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSubmit(formData);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Add Behavior Record</DialogTitle>
                    <DialogDescription>
                        Log a tenant behavior event. This will affect their score.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="type" className="text-right">
                            Type
                        </Label>
                        <Select
                            value={formData.type}
                            onValueChange={handleTypeChange}
                        >
                            <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="positive">Positive</SelectItem>
                                <SelectItem value="negative">Negative</SelectItem>
                                <SelectItem value="neutral">Neutral</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="category" className="text-right">
                            Category
                        </Label>
                        <Input
                            id="category"
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                            className="col-span-3"
                            placeholder="e.g. Late Payment"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="score" className="text-right">
                            Points
                        </Label>
                        <Input
                            id="score"
                            type="number"
                            value={formData.scoreChange}
                            onChange={(e) => setFormData({ ...formData, scoreChange: parseInt(e.target.value) || 0 })}
                            className="col-span-3"
                        />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="desc" className="text-right">
                            Description
                        </Label>
                        <Textarea
                            id="desc"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            className="col-span-3"
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? 'Saving...' : 'Save Record'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};
